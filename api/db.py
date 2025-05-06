from psycopg import AsyncConnection

async def connect(app):
    app['db'] = await AsyncConnection.connect("postgresql://postgres:1234@localhost:5432/exam")

async def close_db(app):
    await app['db'].close()