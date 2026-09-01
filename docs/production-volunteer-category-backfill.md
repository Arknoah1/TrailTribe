# Production volunteer category backfill

This runbook is for the staged migration of `volunteer_template_tasks.category`
(text) to `category_id` (an integer foreign key). It is intentionally an
operator-run production procedure: the application and deployment commands do
not write schema or data to the production database.

## Stage 1: publish the additive schema

Before publishing, use the development database and the Publish schema review
to confirm the diff:

- creates `volunteer_template_categories`
- adds nullable `volunteer_template_tasks.category_id`
- keeps `volunteer_template_tasks.category`
- does **not** truncate `volunteer_template_tasks`
- does **not** rename or delete `category`

If the review offers a truncate or rename choice for
`volunteer_template_tasks`, cancel the publish. The development schema is not
ready for Stage 1.

## Backfill production data

After Stage 1 is published, open the **production** database in Replit's
Database tool. Use the production data editor to create one category row for
each distinct legacy category name, preserving the normalized name and a
lowercase `name_key`. Give each category a unique sort order.

For the current production data, the expected category names are:

- `Bike Village – Before Race Weekend`
- `Bike Village – Saturday`
- `Bike Village – Sunday`
- `Race Day Coaching – Sunday`

Then update every `volunteer_template_tasks` row so `category_id` points to
the matching category row. Do not change or delete the legacy `category` value
until verification is complete.

## Verify the backfill

The following checks must all pass in the production database:

```sql
SELECT COUNT(*) AS total_tasks,
       COUNT(category_id) AS tasks_with_category_id
FROM volunteer_template_tasks;
```

`total_tasks` and `tasks_with_category_id` must be equal and non-zero.

```sql
SELECT t.id, t.category
FROM volunteer_template_tasks AS t
LEFT JOIN volunteer_template_categories AS c
  ON c.id = t.category_id
WHERE t.category_id IS NULL
   OR c.id IS NULL;
```

This must return zero rows.

```sql
SELECT category_id, COUNT(*) AS task_count
FROM volunteer_template_tasks
GROUP BY category_id
ORDER BY category_id;
```

Every `category_id` must identify one existing category. Existing task counts
may differ by category; duplicate task IDs must not be introduced.

## Stage 2: finalize the schema

Only after the checks pass:

1. Restore `category_id` to required in the Drizzle schema.
2. Remove the legacy `category` field from the Drizzle schema.
3. Push the final schema to the development database.
4. Review the Publish diff. It should add the required constraint/index and
   remove the already-migrated legacy column without truncating tasks.
5. Republish and verify template listing, category management, task packs, and
   event volunteer setup.

Never choose a Publisher option that truncates
`volunteer_template_tasks` or treats the text `category` value as the integer
`category_id`.