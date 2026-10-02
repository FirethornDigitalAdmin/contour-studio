#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1

for contour_python in .venv/bin/python python3.14 python3.13 python3.12 python3; do
  if "$contour_python" -c 'import sys; sys.exit(sys.version_info < (3, 12))' >/dev/null 2>&1; then
    "$contour_python" start.py "$@"
    contour_status=$?
    if [ "$contour_status" -ne 0 ] && [ -t 0 ]; then
      read -r -p 'Press Enter to close…' _
    fi
    exit "$contour_status"
  fi
done

echo 'Install Python 3.12 or newer from https://www.python.org/downloads/ and try again.'
echo 'See START-HERE.md for setup help.'
if [ -t 0 ]; then read -r -p 'Press Enter to close…' _; fi
exit 1
