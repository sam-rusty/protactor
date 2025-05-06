from aiohttp import web
import jwt
import bcrypt
import psycopg

async def login(request):
    payload = await request.json()
    email = payload.get("email")
    password = payload.get("password")
    if not email or not password:
        return web.json_response({"message": "Missing email or password"}, status=400)

    if not isinstance(email, str) or not isinstance(password, str):
        return web.json_response({"message": "Invalid email or password"}, status=400)

    db = request.app["db"]
    async with db.cursor(row_factory=psycopg.rows.dict_row) as cur:
        await cur.execute(
            "SELECT first_name, last_name, email, password, role FROM users WHERE email = %s",
            (email,),
        )
        row = await cur.fetchone()
        if row is None:
            return web.json_response(
                {"message": "Invalid email or password"}, status=401
            )
        is_correct_password = bcrypt.checkpw(
            password.encode("utf-8"), row["password"].encode("utf-8")
        )
        if is_correct_password is False:
            return web.json_response(
                {"message": "Invalid email or password"}, status=401
            )
        user = {
            "first_name": row["first_name"],
            "last_name": row["last_name"],
            "email": row["email"],
            "role": row["role"],
        }
        token = jwt.encode(user, "1234", algorithm="HS256")
        return web.json_response(
            {"message": "Login successful", "token": token, "user": user}
        )


async def register(request):
    db = request.app["db"]
    payload = await request.json()
    email = payload.get("email")
    first_name = payload.get("first_name")
    last_name = payload.get("last_name")
    password = payload.get("password")

    if not email or not first_name or not last_name or not password:
        return web.json_response(
            {"message": "Missing email, first name, last name or password"}, status=400
        )
    if (
        not isinstance(email, str)
        or not isinstance(first_name, str)
        or not isinstance(last_name, str)
        or not isinstance(password, str)
    ):
        return web.json_response(
            {"message": "Invalid email, first name, last name or password"}, status=400
        )

    async with db.cursor(row_factory=psycopg.rows.dict_row) as cur:
        await cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        row = await cur.fetchone()
        if row is not None:
            return web.json_response({"message": "User already exists"}, status=400)
        hashed_password = hash_password(password)
        await cur.execute(
            "INSERT INTO users (first_name, last_name, email, password) VALUES (%s, %s, %s, %s)",
            (first_name, last_name, email, hashed_password),
        )
        await db.commit()
    return web.json_response({"success": True}, status=201)


def hash_password(plain_password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


routes = [
    web.post("/authorization/login", login),
    web.post("/authorization/register", register),
]
