import {
  BaseEntity,
  Collection,
  Entity,
  Filter,
  ManyToOne,
  MikroORM,
  OneToMany,
  PrimaryKey,
  Property,
  Rel,
} from '@mikro-orm/sqlite';

@Entity()
class Company extends BaseEntity {
  @PrimaryKey({ autoincrement: true })
  readonly id!: number;

  @Property()
  name!: string;
}

@Entity()
class Location extends BaseEntity {
  @PrimaryKey({ autoincrement: true })
  readonly id!: number;

  @Property()
  name!: string;

  @ManyToOne(() => Company)
  company!: Rel<Company>;
}

@Entity()
@Filter({
  name: 'byLocation',
  cond: ({ locations }) => ({
    location: locations
  })
})
class User extends BaseEntity {
  @PrimaryKey({ autoincrement: true })
  readonly id!: number;

  @Property()
  name!: string;

  @ManyToOne(() => Location)
  location!: Rel<Location>;
}

@Entity()
@Filter({
  name: 'byLocation',
  cond: ({ locations }) => ({
    owner: {
      location: locations
    }
  })
})
@Filter({
  name: 'notDeleted',
  cond: () => ({ deletedAt: null })
})
class ClientManagementObject extends BaseEntity {
  @PrimaryKey({ autoincrement: true })
  readonly id!: number;

  @Property({ nullable: true })
  deletedAt?: Date;

  @Property()
  name!: string;

  @ManyToOne(() => Client)
  client!: Rel<Client>;

  @ManyToOne(() => User)
  owner!: Rel<User>;
}

@Entity()
@Filter({
  name: 'byLocation',
  cond: ({ locations }) => ({
    managementObjects: {
      owner: {
        location: locations
      }
    }
  })
})
class Client extends BaseEntity {
  @PrimaryKey({ autoincrement: true })
  readonly id!: number;

  @Property()
  name!: string;

  @OneToMany(() => ClientManagementObject, (cmo) => cmo.client)
  managementObjects = new Collection<ClientManagementObject>(this);
}

describe('Nested filter serialized as JSON string', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      debug: true,
      dbName: ':memory:',
      entities: [Company, Location, User, Client, ClientManagementObject],
      allowGlobalContext: true,
      loadStrategy: 'select-in',
      autoJoinRefsForFilters: false,
    });
  });

  afterAll(async () => {
    await orm.close(true);
  });

  beforeEach(async () => {
    await orm.schema.dropSchema();
    await orm.schema.createSchema();
  });

  // BUG: When an entity has multiple filters and one has a nested relation condition,
  // during population the nested condition is serialized as JSON string instead of SQL joins.
  // Triggered by: multiple filters + nested relation path in filter condition
  test('nested filter condition incorrectly serialized as JSON during population', async () => {
    const company = orm.em.create(Company, { name: 'Company 1' });
    const location = orm.em.create(Location, { name: 'Location 1', company });
    const user = orm.em.create(User, { name: 'User 1', location });
    const client = orm.em.create(Client, { name: 'Client 1' });
    orm.em.create(ClientManagementObject, { name: 'CMO 1', client, owner: user });

    await orm.em.flush();
    orm.em.clear();

    orm.em.setFilterParams('byLocation', { locations: [location.id] });

    console.log('--- QUERY START ---');
    const results = await orm.em.find(
      ClientManagementObject,
      {},
      { filters: ['byLocation', 'notDeleted'], populate: ['client'] }
    );

    // Main query finds the CMO correctly
    expect(results).toHaveLength(1);

    // BUG: Client population query generates:
    //   on ... and (`c1`.`deleted_at` is null and `c1`.`owner_id` = '{"location":{"$in":[1]}}')
    // The nested condition { owner: { location: locations } } is serialized as JSON
    // instead of being resolved to a proper join. Returns 0 results.
    expect(results[0].client).not.toBeNull();
  });
});
