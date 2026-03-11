-- Enable realtime for connection_requests and maintenance_requests
ALTER TABLE connection_requests REPLICA IDENTITY FULL;
ALTER TABLE maintenance_requests REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE connection_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE maintenance_requests;
