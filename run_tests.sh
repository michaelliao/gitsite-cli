#!/usr/bin/env bash

# run node test/test_*.js

find test -type f -name 'test_*.js' -exec node "{}" \;
