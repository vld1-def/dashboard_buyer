#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AdsPower bridge for the Dashboard CRM.

The CRM page runs in a browser and may not talk to AdsPower directly:
AdsPower's Local API answers no CORS headers, so the browser refuses.
This small program sits between them ON THIS COMPUTER ONLY:

    CRM page  ->  http://127.0.0.1:50326 (this bridge)  ->  AdsPower :50325

What it does and does not do:
  * listens on 127.0.0.1 only - nothing is reachable from the network;
  * answers only pages opened from the CRM site (and localhost);
  * forwards only four calls: status, list folders, create folder,
    create profile. Opening, deleting or reading profiles is not possible
    through it;
  * never prints or stores what passes through (logins, cookies).

Run:  python adspower-bridge.py     (keep the window open)
Needs: Python 3.8+, AdsPower running. No extra packages.
Optional: set ADS_API_KEY if your AdsPower asks for an API key.
"""
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = '1'
PORT = int(os.environ.get('ADS_BRIDGE_PORT', '50326'))
ADS = os.environ.get('ADS_API_URL', 'http://127.0.0.1:50325').rstrip('/')
KEY = os.environ.get('ADS_API_KEY', '').strip()

# Who may call. The site itself, and a local copy of it for development.
ORIGINS = {'https://vld1-def.github.io'}
LOCAL_ORIGIN = re.compile(r'^http://(localhost|127\.0\.0\.1)(:\d+)?$')

# What may be called. Everything else is refused, so a page that somehow
# reached the bridge still could not open or delete a profile.
ROUTES = {
    ('GET', '/api/v1/group/list'),
    ('POST', '/api/v1/group/create'),
    ('POST', '/api/v1/user/create'),
}
MAX_BODY = 4 * 1024 * 1024

# AdsPower allows about one request a second. The bridge spaces the calls
# itself, so the page can simply send them one after another.
GAP = 1.15
_lock = threading.Lock()
_last = [0.0]


def origin_ok(origin):
    return (not origin) or origin in ORIGINS or bool(LOCAL_ORIGIN.match(origin))


def ads_call(method, path_qs, body=None):
    """One spaced call to AdsPower. Returns (http status, bytes)."""
    with _lock:
        for attempt in (1, 2, 3):
            wait = GAP - (time.time() - _last[0])
            if wait > 0:
                time.sleep(wait)
            req = urllib.request.Request(ADS + path_qs, data=body, method=method)
            if body is not None:
                req.add_header('Content-Type', 'application/json')
            if KEY:
                req.add_header('Authorization', 'Bearer ' + KEY)
            try:
                with urllib.request.urlopen(req, timeout=60) as res:
                    status, data = res.status, res.read()
            except urllib.error.HTTPError as e:
                status, data = e.code, e.read()
            finally:
                _last[0] = time.time()
            # "Too many request per second" - wait and try again, twice.
            if b'Too many request' in data and attempt < 3:
                time.sleep(GAP)
                continue
            return status, data
    return 502, b'{}'


class Bridge(BaseHTTPRequestHandler):
    server_version = 'AdsPowerBridge/' + VERSION
    # One request per connection. A refused request leaves its body
    # unread; with keep-alive that body would be parsed as the next
    # request and its text would land in the log.
    protocol_version = 'HTTP/1.0'

    def log_message(self, fmt, *args):   # one short line, never a body
        sys.stdout.write('%s  %s\n' % (time.strftime('%H:%M:%S'), fmt % args))
        sys.stdout.flush()

    def log_error(self, fmt, *args):     # may quote what was sent - say less
        sys.stdout.write('%s  bad request\n' % time.strftime('%H:%M:%S'))
        sys.stdout.flush()

    def log_request(self, code='-', size='-'):
        # Path without the query string: nothing typed by a person in it.
        self.log_message('%s %s -> %s', self.command, self.path.split('?', 1)[0], code)

    def _cors(self):
        origin = self.headers.get('Origin', '')
        if origin and origin_ok(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # Chrome asks this before a public page may call a local address.
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Access-Control-Max-Age', '600')

    def _send(self, status, payload):
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def _guard(self):
        if not origin_ok(self.headers.get('Origin', '')):
            self._send(403, {'code': -1, 'msg': 'This page may not use the bridge.'})
            return False
        return True

    def do_OPTIONS(self):
        self.send_response(204 if origin_ok(self.headers.get('Origin', '')) else 403)
        self._cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def do_GET(self):
        if not self._guard():
            return
        path = self.path.split('?', 1)[0]
        if path == '/status':
            # Is AdsPower itself alive? Said here, so the page asks once.
            ok, why = False, ''
            try:
                status, data = ads_call('GET', '/status')
                ok = status == 200 and json.loads(data.decode('utf-8', 'replace')).get('code') == 0
                if not ok:
                    why = data.decode('utf-8', 'replace')[:200]
            except Exception as e:      # AdsPower closed, wrong port
                why = str(e)[:200]
            self._send(200, {'bridge': VERSION, 'adspower': ok, 'why': why})
            return
        if ('GET', path) not in ROUTES:
            self._send(404, {'code': -1, 'msg': 'The bridge does not forward this call.'})
            return
        self._forward('GET', None)

    def do_POST(self):
        if not self._guard():
            return
        path = self.path.split('?', 1)[0]
        if ('POST', path) not in ROUTES:
            self._send(404, {'code': -1, 'msg': 'The bridge does not forward this call.'})
            return
        try:
            n = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            n = -1
        if n < 0 or n > MAX_BODY:
            self._send(413, {'code': -1, 'msg': 'Request is too large.'})
            return
        body = self.rfile.read(n)
        try:
            json.loads(body.decode('utf-8'))
        except Exception:
            self._send(400, {'code': -1, 'msg': 'Body must be JSON.'})
            return
        self._forward('POST', body)

    def _forward(self, method, body):
        try:
            status, data = ads_call(method, self.path, body)
        except Exception as e:
            self._send(502, {'code': -1, 'msg': 'AdsPower did not answer: ' + str(e)[:200]})
            return
        self._send(status, data)


def main():
    try:
        srv = ThreadingHTTPServer(('127.0.0.1', PORT), Bridge)
    except OSError as e:
        print('Could not start on port %d: %s' % (PORT, e))
        print('The bridge is probably already running in another window.')
        return 1
    print('AdsPower bridge is running on http://127.0.0.1:%d' % PORT)
    print('AdsPower address: %s%s' % (ADS, '  (with API key)' if KEY else ''))
    print('Keep this window open while you send accounts from the CRM.')
    print('Close it (or press Ctrl+C) to stop.\n')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == '__main__':
    sys.exit(main())
