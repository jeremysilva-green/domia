-- Allow owners to delete connection requests sent to them
CREATE POLICY "Owners can delete their connection requests"
ON connection_requests
FOR DELETE
TO authenticated
USING (owner_id IN (SELECT id FROM owners WHERE id = auth.uid()));
