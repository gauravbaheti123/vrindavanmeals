CREATE POLICY "Staff can read student photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'student-photos');
CREATE POLICY "Staff can upload student photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'student-photos');
CREATE POLICY "Staff can update student photos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'student-photos') WITH CHECK (bucket_id = 'student-photos');
CREATE POLICY "Staff can delete student photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'student-photos');