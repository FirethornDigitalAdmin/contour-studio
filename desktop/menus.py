"""Native menus route into the same workspace actions as the on-screen controls."""
import json
import logging
import sys


def studio_menu(window):
    from webview.menu import Menu, MenuAction, MenuSeparator

    def action(title, command):
        def run():
            try:
                window.evaluate_js('window.dispatchEvent(new CustomEvent("contour:menu", '
                                   + json.dumps({'detail': command}) + '))')
            except Exception:
                logging.exception('Native menu action failed: %s', command)
        return MenuAction(title, run)

    return [
        Menu('__app__' if sys.platform == 'darwin' else 'Contour Studio', [
            action('Check for Updates…', 'updates'),
        ]),
        Menu('Studio', [
            action('Choose a Place', 'place'),
            action('Design Your Map', 'design'),
            action('Make & Print', 'make'),
            MenuSeparator(),
            action('My Projects…', 'projects'),
            MenuSeparator(),
            action('Save Design…', 'save-design'),
            action('Import Design…', 'import-design'),
        ]),
        Menu('Help', [action('How It Works', 'help')]),
    ]
