"""Console-capable helper for native workers inside a windowed desktop app."""
import multiprocessing
import runpy
import sys

if __name__ == '__main__':
    multiprocessing.freeze_support()
    if len(sys.argv) < 2 or sys.argv[1] not in ('backend.worker', 'backend.buildings', 'desktop.smoke', 'desktop.updater'):
        raise SystemExit('This helper is launched by Contour Studio.')
    module = sys.argv.pop(1)
    runpy.run_module(module, run_name='__main__')
