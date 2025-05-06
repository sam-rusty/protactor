from aiohttp import web
import aiohttp_cors

from logger import log
from webrtc import app

import db

from controllers import authorization, students

app.add_routes(authorization.routes)
app.add_routes(students.routes)

# Configure default CORS settings
cors = aiohttp_cors.setup(app, defaults={
    "*": aiohttp_cors.ResourceOptions(
        allow_credentials=True,
        expose_headers="*",
        allow_headers="*",
    )
})

for route in list(app.router.routes()):
    try:
        cors.add(route)
    except ValueError as e:
        if "already has OPTIONS handler" in str(e):
            continue  # skip routes like /socket.io/ that already handle OPTIONS
        else:
            raise

if __name__ == "__main__":
    # connect to the postgres database
    app.on_startup.append(db.connect)
    app.on_cleanup.append(db.close_db)
    web.run_app(app, host="0.0.0.0", port=5002)
    log.debug("Starting WebRTC server on port 5002")