#!/usr/bin/env python3
"""
Universal script to download all external dependencies of an HTML file
and their nested dependencies for offline usage.

This script:
1. Parses HTML files for external CSS/JS dependencies
2. Downloads them preserving directory structure
3. Recursively parses CSS for @import and url() resources
4. Avoids duplicate downloads
5. Provides clear logging

Usage:
    python scripts/download_deps_recursive.py <html_file> [output_dir]
    
    html_file: Path to HTML file or URL
    output_dir: Output directory (default: 'deps')

Example:
    python scripts/download_deps_recursive.py test.html
    python scripts/download_deps_recursive.py test.html my_deps
"""

import os
import sys
import re
import argparse
import logging
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Set, Dict, Optional
from html.parser import HTMLParser

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('download_deps.log')
    ]
)

logger = logging.getLogger(__name__)


class HTMLDependencyParser(HTMLParser):
    """Parser to extract external CSS and JS dependencies from HTML."""
    
    def __init__(self):
        super().__init__()
        self.dependencies = []
        
    def handle_starttag(self, tag, attrs):
        """Handle HTML start tags to find external dependencies."""
        attrs_dict = dict(attrs)
        
        if tag == 'link' and attrs_dict.get('rel') == 'stylesheet':
            href = attrs_dict.get('href')
            if href and self._is_external_url(href):
                self.dependencies.append(('css', href))
                
        elif tag == 'script':
            src = attrs_dict.get('src')
            if src and self._is_external_url(src):
                self.dependencies.append(('js', src))
    
    @staticmethod
    def _is_external_url(url: str) -> bool:
        """Check if URL is external (not relative)."""
        return url.startswith(('http://', 'https://'))


class CSSDependencyParser:
    """Parser to extract dependencies from CSS files."""
    
    @staticmethod
    def parse_css_dependencies(css_content: str) -> Set[str]:
        """Extract @import and url() dependencies from CSS content."""
        dependencies = set()
        
        # Find @import statements
        import_pattern = r'@import\s+(?:url\()?["\']?([^"\')]+)["\']?(?:\))?'
        imports = re.findall(import_pattern, css_content, re.IGNORECASE)
        dependencies.update(imports)
        
        # Find url() statements
        url_pattern = r'url\(["\']?([^"\')]+)["\']?\)'
        urls = re.findall(url_pattern, css_content, re.IGNORECASE)
        dependencies.update(urls)
        
        # Filter out data URLs and relative paths starting with #
        return {dep for dep in dependencies 
                if not dep.startswith(('data:', '#')) and dep.strip()}


class DependencyDownloader:
    """Main class to handle downloading dependencies recursively."""
    
    def __init__(self, output_dir: str = 'deps'):
        self.output_dir = Path(output_dir)
        self.downloaded_urls: Set[str] = set()
        self.url_to_file: Dict[str, Path] = {}
        
        # Create output directories
        self.css_dir = self.output_dir / 'css'
        self.js_dir = self.output_dir / 'js'
        self.assets_dir = self.output_dir / 'assets'
        
        for dir_path in [self.css_dir, self.js_dir, self.assets_dir]:
            dir_path.mkdir(parents=True, exist_ok=True)
    
    def download_file(self, url: str, file_path: Path) -> Optional[str]:
        """Download a file from URL to local path."""
        if url in self.downloaded_urls:
            logger.info(f"Already downloaded: {url}")
            return None
            
        try:
            logger.info(f"Downloading: {url}")
            
            # Add User-Agent to avoid blocking
            req = urllib.request.Request(
                url, 
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
            )
            
            with urllib.request.urlopen(req, timeout=30) as response:
                content = response.read().decode('utf-8', errors='ignore')
                
            # Ensure directory exists
            file_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write content to file
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
                
            self.downloaded_urls.add(url)
            self.url_to_file[url] = file_path
            logger.info(f"Successfully downloaded: {url} -> {file_path}")
            
            return content
            
        except Exception as e:
            logger.error(f"Failed to download {url}: {e}")
            return None
    
    def get_filename_from_url(self, url: str) -> str:
        """Extract filename from URL."""
        parsed = urllib.parse.urlparse(url)
        filename = os.path.basename(parsed.path)
        
        # If no filename, create one from domain and path
        if not filename or '.' not in filename:
            domain = parsed.netloc.replace('.', '_')
            path_part = parsed.path.replace('/', '_').strip('_')
            query_part = parsed.query[:10] if parsed.query else ''
            filename = f"{domain}_{path_part}_{query_part}".replace('__', '_')
            
            # Add appropriate extension based on content type or URL
            if '/css' in url or url.endswith('.css'):
                filename += '.css'
            elif '/js' in url or url.endswith('.js'):
                filename += '.js'
            else:
                filename += '.css'  # Default for most imports
                
        return filename
    
    def resolve_css_url(self, base_url: str, relative_url: str) -> str:
        """Resolve relative URL against base URL."""
        if relative_url.startswith(('http://', 'https://')):
            return relative_url
        return urllib.parse.urljoin(base_url, relative_url)
    
    def process_css_file(self, css_url: str, css_content: str):
        """Process CSS file to find and download nested dependencies."""
        parser = CSSDependencyParser()
        css_dependencies = parser.parse_css_dependencies(css_content)
        
        for dep_url in css_dependencies:
            # Resolve relative URLs
            full_url = self.resolve_css_url(css_url, dep_url)
            
            if not full_url.startswith(('http://', 'https://')):
                continue
                
            # Determine file type and target directory
            if full_url.endswith('.css') or '@import' in css_content and dep_url in css_content:
                target_dir = self.css_dir
                file_ext = '.css'
            else:
                target_dir = self.assets_dir
                # Try to preserve original extension
                parsed_url = urllib.parse.urlparse(full_url)
                original_ext = os.path.splitext(parsed_url.path)[1]
                file_ext = original_ext if original_ext else '.asset'
            
            filename = self.get_filename_from_url(full_url)
            if not filename.endswith(file_ext) and file_ext != '.asset':
                filename = os.path.splitext(filename)[0] + file_ext
                
            file_path = target_dir / filename
            
            # Download the dependency
            content = self.download_file(full_url, file_path)
            
            # If it's a CSS file, recursively process it
            if content and (full_url.endswith('.css') or file_ext == '.css'):
                self.process_css_file(full_url, content)
    
    def download_html_dependencies(self, html_input: str):
        """Download all dependencies from HTML file or URL."""
        # Determine if input is URL or file path
        if html_input.startswith(('http://', 'https://')):
            # Download HTML content from URL
            try:
                req = urllib.request.Request(
                    html_input,
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
                )
                with urllib.request.urlopen(req, timeout=30) as response:
                    html_content = response.read().decode('utf-8', errors='ignore')
                base_url = html_input
            except Exception as e:
                logger.error(f"Failed to download HTML from {html_input}: {e}")
                return
        else:
            # Read HTML from local file
            try:
                with open(html_input, 'r', encoding='utf-8') as f:
                    html_content = f.read()
                base_url = f"file://{os.path.abspath(html_input)}"
            except Exception as e:
                logger.error(f"Failed to read HTML file {html_input}: {e}")
                return
        
        # Parse HTML for dependencies
        parser = HTMLDependencyParser()
        parser.feed(html_content)
        
        logger.info(f"Found {len(parser.dependencies)} dependencies in HTML")
        
        # Download each dependency
        for dep_type, url in parser.dependencies:
            if dep_type == 'css':
                target_dir = self.css_dir
                file_ext = '.css'
            else:  # js
                target_dir = self.js_dir
                file_ext = '.js'
            
            filename = self.get_filename_from_url(url)
            if not filename.endswith(file_ext):
                filename = os.path.splitext(filename)[0] + file_ext
                
            file_path = target_dir / filename
            
            # Download the file
            content = self.download_file(url, file_path)
            
            # If it's a CSS file, process it for nested dependencies
            if content and dep_type == 'css':
                self.process_css_file(url, content)
    
    def print_summary(self):
        """Print download summary."""
        logger.info(f"\n=== Download Summary ===")
        logger.info(f"Total files downloaded: {len(self.downloaded_urls)}")
        logger.info(f"Output directory: {self.output_dir}")
        
        css_files = list(self.css_dir.glob('**/*.css')) if self.css_dir.exists() else []
        js_files = list(self.js_dir.glob('**/*.js')) if self.js_dir.exists() else []
        asset_files = list(self.assets_dir.glob('**/*')) if self.assets_dir.exists() else []
        
        logger.info(f"CSS files: {len(css_files)}")
        logger.info(f"JS files: {len(js_files)}")
        logger.info(f"Asset files: {len(asset_files)}")
        
        if css_files:
            logger.info("CSS files:")
            for f in css_files:
                logger.info(f"  {f.relative_to(self.output_dir)}")
                
        if js_files:
            logger.info("JS files:")
            for f in js_files:
                logger.info(f"  {f.relative_to(self.output_dir)}")


def main():
    """Main function to handle command line arguments."""
    parser = argparse.ArgumentParser(
        description='Download all external dependencies of an HTML file recursively',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/download_deps_recursive.py test.html
  python scripts/download_deps_recursive.py test.html my_deps
  python scripts/download_deps_recursive.py https://example.com/page.html
        """
    )
    
    parser.add_argument(
        'html_file',
        help='Path to HTML file or URL'
    )
    
    parser.add_argument(
        'output_dir',
        nargs='?',
        default='deps',
        help='Output directory (default: deps)'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Create downloader and process HTML
    downloader = DependencyDownloader(args.output_dir)
    
    try:
        downloader.download_html_dependencies(args.html_file)
        downloader.print_summary()
        
        logger.info(f"\nDependencies downloaded to: {args.output_dir}")
        logger.info("Check download_deps.log for detailed logs.")
        
    except KeyboardInterrupt:
        logger.info("\nDownload interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()