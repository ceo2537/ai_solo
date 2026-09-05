CREATE TABLE public.rate_limit_counters (
  bucket_key text PRIMARY KEY,
  hit_count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.rate_limit_counters FROM anon, authenticated;
GRANT ALL ON public.rate_limit_counters TO service_role;
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.consultation_request_locks (
  lock_key text PRIMARY KEY,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.consultation_request_locks FROM anon, authenticated;
GRANT ALL ON public.consultation_request_locks TO service_role;
ALTER TABLE public.consultation_request_locks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  _bucket_key text,
  _limit integer,
  _window_seconds integer,
  _block_seconds integer DEFAULT 0
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.rate_limit_counters%ROWTYPE;
  ttl integer := LEAST(3600, GREATEST(_window_seconds, _block_seconds, 60));
BEGIN
  DELETE FROM public.rate_limit_counters WHERE expires_at < now();

  INSERT INTO public.rate_limit_counters (bucket_key, hit_count, window_started_at, expires_at)
  VALUES (_bucket_key, 0, now(), now() + make_interval(secs => ttl))
  ON CONFLICT (bucket_key) DO UPDATE SET updated_at = now()
  RETURNING * INTO rec;

  IF rec.blocked_until IS NOT NULL AND rec.blocked_until > now() THEN
    RETURN QUERY SELECT false, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (rec.blocked_until - now())))::integer);
    RETURN;
  END IF;

  IF rec.window_started_at + make_interval(secs => _window_seconds) <= now() THEN
    rec.hit_count := 1;
    rec.window_started_at := now();
    rec.blocked_until := NULL;
  ELSE
    rec.hit_count := rec.hit_count + 1;
  END IF;

  IF rec.hit_count > _limit THEN
    IF _block_seconds > 0 THEN
      rec.blocked_until := now() + make_interval(secs => _block_seconds);
    END IF;

    UPDATE public.rate_limit_counters
    SET hit_count = rec.hit_count,
        window_started_at = rec.window_started_at,
        blocked_until = rec.blocked_until,
        expires_at = now() + make_interval(secs => ttl),
        updated_at = now()
    WHERE bucket_key = _bucket_key;

    RETURN QUERY SELECT false, GREATEST(
      1,
      CEIL(EXTRACT(EPOCH FROM (
        COALESCE(rec.blocked_until, rec.window_started_at + make_interval(secs => _window_seconds)) - now()
      )))::integer
    );
    RETURN;
  END IF;

  UPDATE public.rate_limit_counters
  SET hit_count = rec.hit_count,
      window_started_at = rec.window_started_at,
      blocked_until = NULL,
      expires_at = now() + make_interval(secs => ttl),
      updated_at = now()
  WHERE bucket_key = _bucket_key;

  RETURN QUERY SELECT true, 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.rate_limit_peek(_bucket_key text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  blocked timestamptz;
BEGIN
  DELETE FROM public.rate_limit_counters WHERE expires_at < now();
  SELECT blocked_until INTO blocked
  FROM public.rate_limit_counters
  WHERE bucket_key = _bucket_key;

  IF blocked IS NULL OR blocked <= now() THEN
    RETURN 0;
  END IF;
  RETURN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (blocked - now())))::integer);
END;
$$;

CREATE OR REPLACE FUNCTION public.rate_limit_reset(_bucket_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limit_counters WHERE bucket_key = _bucket_key OR expires_at < now();
$$;

CREATE OR REPLACE FUNCTION public.claim_request_lock(_lock_key text, _ttl_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed integer;
BEGIN
  DELETE FROM public.consultation_request_locks WHERE expires_at < now();
  INSERT INTO public.consultation_request_locks (lock_key, expires_at)
  VALUES (_lock_key, now() + make_interval(secs => LEAST(3600, GREATEST(_ttl_seconds, 10))))
  ON CONFLICT (lock_key) DO NOTHING;
  GET DIAGNOSTICS claimed = ROW_COUNT;
  RETURN claimed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_request_lock(_lock_key text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.consultation_request_locks WHERE lock_key = _lock_key OR expires_at < now();
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_peek(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_limit_reset(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_request_lock(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_request_lock(text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_peek(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_limit_reset(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_request_lock(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_request_lock(text) TO service_role;