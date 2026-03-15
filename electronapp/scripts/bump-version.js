#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function bumpPatch(version) {
    const parts = version.split(".");
    if (parts.length !== 3) {
        throw new Error(`Unsupported version format: ${version}`);
    }
    const [major, minor, patch] = parts.map((part) => Number(part));
    if ([major, minor, patch].some((num) => Number.isNaN(num))) {
        throw new Error(`Unsupported version format: ${version}`);
    }
    return `${major}.${minor}.${patch + 1}`;
}

if (process.env.SKIP_BUMP === "1" || process.env.SKIP_BUMP === "true") {
    console.log("Version bump skipped (SKIP_BUMP=1).");
    process.exit(0);
}

const packageJsonPath = path.resolve(__dirname, "..", "package.json");
const packageLockPath = path.resolve(__dirname, "..", "package-lock.json");

const packageJson = readJson(packageJsonPath);
const nextVersion = bumpPatch(packageJson.version);
packageJson.version = nextVersion;
writeJson(packageJsonPath, packageJson);

if (fs.existsSync(packageLockPath)) {
    const packageLock = readJson(packageLockPath);
    packageLock.version = nextVersion;
    if (packageLock.packages && packageLock.packages[""]) {
        packageLock.packages[""].version = nextVersion;
    }
    writeJson(packageLockPath, packageLock);
}

console.log(`Version bumped to ${nextVersion}`);
