-- =========================================
-- KISE HOTEL ENTERPRISE DATABASE
-- =========================================

CREATE DATABASE kisehotel;
\c kisehotel

-- =========================================
-- CORE TABLES
-- =========================================

CREATE TABLE branches(
 id SERIAL PRIMARY KEY,
 name TEXT,
 location TEXT,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users(
 id SERIAL PRIMARY KEY,
 branch_id INT REFERENCES branches(id) ON DELETE CASCADE,
 username TEXT UNIQUE,
 password TEXT,
 role TEXT CHECK(role IN('admin','staff','guest')),
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE guests(
 id SERIAL PRIMARY KEY,
 branch_id INT REFERENCES branches(id) ON DELETE CASCADE,
 full_name TEXT,
 phone TEXT,
 email TEXT,
 id_number TEXT
);

CREATE TABLE rooms(
 id SERIAL PRIMARY KEY,
 branch_id INT REFERENCES branches(id),
 room_number TEXT,
 room_type TEXT,
 base_price NUMERIC,
 status TEXT DEFAULT 'Available'
 CHECK(status IN('Available','Occupied','Maintenance'))
);

CREATE TABLE bookings(
 id SERIAL PRIMARY KEY,
 branch_id INT REFERENCES branches(id),
 guest_id INT REFERENCES guests(id),
 room_id INT REFERENCES rooms(id),
 check_in DATE,
 check_out DATE,
 status TEXT DEFAULT 'Booked'
);

CREATE TABLE payments(
 id SERIAL PRIMARY KEY,
 booking_id INT REFERENCES bookings(id),
 amount NUMERIC,
 method TEXT,
 paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs(
 id SERIAL PRIMARY KEY,
 user_id INT REFERENCES users(id),
 action TEXT,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- PERFORMANCE INDEXES
-- =========================================

CREATE INDEX idx_room_branch ON rooms(branch_id);
CREATE INDEX idx_booking_room ON bookings(room_id);
CREATE INDEX idx_payment_booking ON payments(booking_id);

-- =========================================
-- SYSTEM LOG TABLE
-- =========================================

CREATE TABLE system_logs(
 id SERIAL PRIMARY KEY,
 table_name TEXT,
 action TEXT,
 changed_data JSONB,
 changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- TRIGGER FUNCTION
-- =========================================

CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  INSERT INTO system_logs(table_name,action,changed_data)
  VALUES(TG_TABLE_NAME,TG_OP,row_to_json(OLD));
  RETURN OLD;
 END IF;

 IF TG_OP='UPDATE' THEN
  INSERT INTO system_logs(table_name,action,changed_data)
  VALUES(TG_TABLE_NAME,TG_OP,row_to_json(NEW));
  RETURN NEW;
 END IF;

 IF TG_OP='INSERT' THEN
  INSERT INTO system_logs(table_name,action,changed_data)
  VALUES(TG_TABLE_NAME,TG_OP,row_to_json(NEW));
  RETURN NEW;
 END IF;
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- ATTACH TRIGGERS
-- =========================================

CREATE TRIGGER trg_rooms
AFTER INSERT OR UPDATE OR DELETE ON rooms
FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_bookings
AFTER INSERT OR UPDATE OR DELETE ON bookings
FOR EACH ROW EXECUTE FUNCTION audit_trigger();

CREATE TRIGGER trg_payments
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- =========================================
-- STORED PROCEDURE — SAFE BOOKING
-- =========================================

CREATE OR REPLACE FUNCTION create_booking(
 g INT,
 r INT,
 cin DATE,
 cout DATE
)
RETURNS TEXT AS $$

BEGIN
 IF (SELECT status FROM rooms WHERE id=r)='Occupied' THEN
  RETURN 'Room already occupied';
 END IF;

 INSERT INTO bookings(guest_id,room_id,check_in,check_out,status)
 VALUES(g,r,cin,cout,'Booked');

 UPDATE rooms SET status='Occupied' WHERE id=r;

 RETURN 'Booking successful';
END;
$$ LANGUAGE plpgsql;

-- =========================================
-- ANALYTICS WAREHOUSE
-- =========================================

CREATE SCHEMA analytics;

CREATE TABLE analytics.revenue_fact(
 id SERIAL PRIMARY KEY,
 booking_id INT,
 branch_id INT,
 amount NUMERIC,
 payment_date DATE
);

CREATE TABLE analytics.dim_branch(
 id INT PRIMARY KEY,
 name TEXT,
 location TEXT
);

CREATE TABLE analytics.dim_room(
 id INT PRIMARY KEY,
 type TEXT,
 price NUMERIC
);

CREATE TABLE analytics.dim_date(
 date DATE PRIMARY KEY,
 day INT,
 month INT,
 year INT
);

-- =========================================
-- LOAD ANALYTICS DATA
-- =========================================

INSERT INTO analytics.revenue_fact(booking_id,branch_id,amount,payment_date)
SELECT b.id,b.branch_id,p.amount,p.paid_at
FROM bookings b
JOIN payments p ON b.id=p.booking_id;

-- =========================================
-- INITIAL DATA
-- =========================================

INSERT INTO branches(name,location)
VALUES('KISE Nairobi','Kenya');

INSERT INTO users(branch_id,username,password,role)
VALUES(1,'admin','hashedpassword','admin');

-- =========================================
-- END OF FILE
-- =========================================
