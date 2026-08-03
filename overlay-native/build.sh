#!/bin/sh
# builds the native overlay shell (~85KB, no dependencies beyond macOS)
cd "$(dirname "$0")"
swiftc -O -framework Cocoa -framework WebKit -o billy-overlay BillyOverlay.swift && echo "built: billy-overlay"
