-- database/migrations/009_substitute_doctor.sql

ALTER TABLE blocked_periods 
ADD COLUMN IF NOT EXISTS substitute_doctor_name text,
ADD COLUMN IF NOT EXISTS substitute_doctor_note text;

ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS served_by text;
