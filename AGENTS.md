# Project Instructions for Codex

## Project Type
This is a Python project. Always follow a clean, module-based architecture.

## Code Structure Rules
- Do not write all logic in one file.
- Split code by modules/features.
- Keep business logic, database logic, API routes, validation, and permissions separate.
- Use reusable services/helpers where needed.
- Avoid duplicate code.

## Suggested Structure
```text
app/
  modules/
    users/
      models.py
      schemas.py
      routes.py
      services.py
      permissions.py
    roles/
    auth/
  core/
    config.py
    database.py
    security.py
  common/
    response.py
    exceptions.py
    utils.py
```

## Coding Standards
- Write optimized, readable, maintainable code.
- Use proper function names and class names.
- Add type hints where useful.
- Handle errors properly.
- Do not hardcode values; use config or environment variables.
- Keep functions small and focused.

## Role & Permission Management
- Every protected API must check user role and permission.
- Do not use manual hardcoded conditions like:
  `if user.role == "admin"`
- Use dynamic permission-based checks from database.
- Admin should have all access by default.
- User access must depend on assigned permissions.

## Permission Pattern
Use this style:
- `roles` table
- `permissions` table
- `role_permissions` table
- `users` table with `role_id`
- API checks permission key like:
  `company.create`, `company.view`, `company.update`, `company.delete`

## Before Final Answer
- Explain what files were changed.
- Mention any migration/database changes.
- Mention how to test the feature.
- Do not break existing project structure.
