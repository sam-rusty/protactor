from aiohttp import web
import jwt

def validate_login(handler):
    async def middleware_handler(request):
        # Extract the Authorization header
        auth_header = request.headers.get('Authorization', None)
        if not auth_header or not auth_header.startswith('Bearer '):
            return web.json_response({"message": "Missing or invalid token"}, status=401)

        token = auth_header.split(' ')[1]
        try:
            # Decode the JWT (replace 'your-secret-key' with your actual secret key)
            payload = jwt.decode(token, '1234', algorithms=['HS256'])
            request['user'] = payload
        except jwt.ExpiredSignatureError:
            return web.json_response({"message": "Token has expired"}, status=401)
        except jwt.InvalidTokenError:
            return web.json_response({"message": "Invalid token"}, status=401)

        # Check if the user type is allowed
        if payload.get('role') != 'Invigilator':
            return web.json_response({"message": "Unauthorized user type"}, status=403)

        return await handler(request)

    return middleware_handler