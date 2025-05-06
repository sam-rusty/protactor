from aiohttp import web
import psycopg
from controllers.middlewares import validate_login

@validate_login
async def find(request):
    db = request.app["db"]
    async with db.cursor(row_factory=psycopg.rows.dict_row) as cur:
        await cur.execute(
            "SELECT id, first_name, last_name FROM users WHERE role = 'Student'"
        )
        rows = await cur.fetchall()
        return web.json_response(rows)

@validate_login
async def find_by_id(request):
    id = request.match_info.get("id")
    db = request.app["db"]
    async with db.cursor(row_factory=psycopg.rows.dict_row) as cur:
        await cur.execute("SELECT * FROM users WHERE id = %s", (id,))
        row = await cur.fetchone()
        if row is None:
            return web.json_response({"message": "User not found"}, status=404)
        return web.json_response(row)

@validate_login
async def find_suspicious_activities(request):
    id = request.match_info.get("id")
    db = request.app["db"]
    async with db.cursor(row_factory=psycopg.rows.dict_row) as cur:
        await cur.execute(
            "SELECT id, activity, timestamp FROM user_suspicious_activities WHERE user_id = %s ORDER BY timestamp DESC", (id,)
        )
        rows = await cur.fetchall()
        for row in rows:
            row["timestamp"] = row["timestamp"].strftime("%Y-%m-%d %H:%M:%S")
        
        return web.json_response(rows)

async def add_suspicious_activity(request):
    data = await request.json()
    id = request.match_info.get("id")
    activity = data.get("activity")
    db = request.app["db"]
    async with db.cursor() as cur:
        await cur.execute(
            "INSERT INTO user_suspicious_activities (user_id, activity) VALUES (%s, %s)",
            (id, activity),
        )
        await db.commit()
        return web.json_response({"message": "Suspicious activity added"}, status=201)


routes = [
    web.get("/students", find),
    web.get("/students/{id}", find_by_id),
    web.get("/students/{id}/suspicious-activities", find_suspicious_activities),
]
