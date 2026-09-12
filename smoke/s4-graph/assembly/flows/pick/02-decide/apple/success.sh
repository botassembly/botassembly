#!/bin/sh
# `success` runs after the output passed every check, and the output is no
# longer anyone's to change (hooks.md): this one only reads it, and what it
# prints is captured beside the run.
cat "$OUTPUT"
