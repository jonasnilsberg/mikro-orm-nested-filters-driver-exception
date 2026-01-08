# MikroORM Bug: Nested Filter in $or Causes DriverException During Population

## Bug Description

When using `select-in` load strategy with filters containing nested relation paths inside `$or` conditions, population fails with:

```
DriverException: Cannot read properties of undefined (reading 'findIndex')
```

## Reproduction

```bash
npm install
npm test
```

## Setup

- MikroORM 6.6.3
- SQLite (in-memory)
- `loadStrategy: 'select-in'`
- `autoJoinRefsForFilters: false`

## Entities

- `Company` -> has many `Location`
- `Location` -> belongs to `Company`
- `User` -> belongs to `Location`, has many `UserRoleBinding`
- `UserRoleBinding` -> belongs to `User`, belongs to `Company` (nullable), has many `Location`

## Filter Causing Issue

```typescript
@Filter({
  name: 'test',
  cond: ({locations}) => ({
    $or: [
      { company: { locations: locations } },  // nested relation path
      { locations: locations },
    ]
  })
})
class UserRoleBinding extends BE { ... }
```

## Failing Query

```typescript
orm.em.setFilterParams('test', { locations: [1] });
await orm.em.find(User, {}, { filters: ['test'], populate: ['userRoleBindings'] });
```

## Behavior

1. Initial `User` query succeeds with filter applied
2. Population of `userRoleBindings` fails when filter with nested `$or` condition is applied
3. Error occurs in `QueryBuilderHelper.mapper` during join processing
