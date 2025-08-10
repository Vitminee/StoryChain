-- This would revert to the previous schema, but since we're cleaning up, we'll just drop everything
DROP TABLE IF EXISTS changes CASCADE;
DROP TABLE IF EXISTS documents CASCADE;