# Business category administration

Platform Admin → Settings → Business Categories owns the catalog. Administrators can add or rename categories, set display order (lower first), and deactivate/reactivate categories. Vendor registration and business profile editing fetch active options from the public catalog and submit stable IDs. There is no free-text category creation in vendor forms.

The initial active names are Sports and Recreation, Health and Wellness, Retail and E-Commerce, Food and Beverage, and Generic Service Business. Existing custom labels are imported as inactive categories. Empty legacy categories remain unassigned. Inactive assignments may be retained during unrelated profile edits; a vendor can switch to an active category.

Apply `database/migrations/20260905_add_business_categories.sql` before deploying the application changes. The bootstrap schema contains the same definition. The migration adds `business_category_id` to tenants, backfills assignments, and keeps `public_profile_category` for existing clients. Renames update that legacy display field and preserve old names as lookup/search aliases. Renamed or inactive categories cannot have their former names reused by a different category. Categories are not deleted.

API:

- `GET /api/public/business-categories`: active choices in display order.
- `GET /api/platform/business-categories`: complete catalog and assignment counts.
- `POST /api/platform/business-categories`: create with `name`, `isActive`, and `sortOrder`.
- `PATCH /api/platform/business-categories/:id`: update the same fields plus the last-read `revision`. Stale edits return 409.
- Registration accepts `categoryId`; legacy `category` labels resolve through the alias table.
- Profile settings accept `businessCategoryId`; legacy `publicProfileCategory` remains supported.

All platform catalog endpoints require `platform.settings.manage`. Existing authentication and CSRF middleware apply. Catalog changes and audit events commit in the same transaction. Database assignment checks also reject newly assigned inactive categories.

Validation includes backend/frontend suites and an opt-in PostgreSQL integration test:

```sh
BUSINESS_CATEGORY_TEST_CONTAINER=getprio-dev-database-1 node --test backend/tests/businessCategories.postgres.test.cjs
```

That test creates an isolated schema inside a transaction and rolls it back; it does not alter application records. It covers initial seeding, repeated migration, legacy assignments, stable IDs, old-name aliases, renamed display values, duplicate names, stale revisions, inactive selection, and audit records.
