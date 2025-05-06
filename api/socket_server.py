import socketio

socket = socketio.AsyncServer(cors_allowed_origins=["http://localhost:3000"], async_mode='aiohttp')
