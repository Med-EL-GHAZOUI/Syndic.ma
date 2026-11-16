// Production migration runner: `node dist/migrate.js` (no ts-node needed in the image).
import dataSource from './data-source';

dataSource
  .initialize()
  .then((ds) => ds.runMigrations({ transaction: 'each' }))
  .then((done) => {
    console.log(`Applied ${done.length} migration(s)`);
    return dataSource.destroy();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
