-- 049: Product descriptions are at most 1,000 characters (lib/productLimits.ts). The app and the
-- server already refuse longer ones; this makes the database agree, so nothing can store more.
-- Every live listing was under the limit when this was added (longest: 749).
alter table products drop constraint if exists products_description_length;
alter table products add constraint products_description_length
  check (description is null or char_length(description) <= 1000);
