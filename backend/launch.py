"""Single-server local launcher used by start.command."""
import threading
import webbrowser
import httpx
import uvicorn

URL='http://127.0.0.1:8765'
if __name__=='__main__':
    try:
        response=httpx.get(URL+'/api/health',timeout=1)
        if response.json().get('application')=='Contour Studio':
            webbrowser.open(URL)
            raise SystemExit(0)
    except (httpx.HTTPError,ValueError):
        pass
    print('\nContour Studio: '+URL+'\nKeep this window open. Press Ctrl+C to stop.\n')
    threading.Timer(1.5,lambda:webbrowser.open(URL)).start()
    uvicorn.run('backend.app:app',host='127.0.0.1',port=8765)
