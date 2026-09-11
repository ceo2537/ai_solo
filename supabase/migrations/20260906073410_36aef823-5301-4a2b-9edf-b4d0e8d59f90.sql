GRANT SELECT ON public.consultation_operation_logs TO authenticated;
CREATE POLICY "Admins can read operation logs"
ON public.consultation_operation_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));