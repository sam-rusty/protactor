DROP TABLE IF EXISTS users;
CREATE TYPE user_role AS ENUM ('Invigilator', 'Student');

-- Postgres table for users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(45) UNIQUE NOT NULL,
    first_name VARCHAR(20) NOT NULL,
    last_name VARCHAR(20) NOT NULL,
    role user_role NOT NULL DEFAULT 'Student',
    password VARCHAR(255) NOT NULL
);

DROP type IF EXISTS suspicious_activity;

CREATE TYPE suspicious_activity AS ENUM ('Multiple faces', 'No face', 'Looking away');

DROP TABLE IF EXISTS user_suspicious_activities;
CREATE TABLE IF NOT EXISTS user_suspicious_activities (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users ON DELETE CASCADE,
    activity suspicious_activity NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- create studnet user
INSERT INTO users (email, first_name, last_name, role, password) VALUES  
('student@gmail.com', 'Student', 'User', 'Student', '$2b$12$jpJV1aRtGHhhMXBCVmRHf.STS6Qb3ShuQPhSKGGb8WQJ3QorNJZB6'),
('admin@gmail.com', 'Invigilator', 'User', 'Invigilator', '$2b$12$jpJV1aRtGHhhMXBCVmRHf.STS6Qb3ShuQPhSKGGb8WQJ3QorNJZB6');