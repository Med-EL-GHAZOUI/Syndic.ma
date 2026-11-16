// Imported first by app.module.ts so it applies to the API, the seed scripts and the tests alike.
//
// node-postgres parses SQL `date` (OID 1082) into a JavaScript Date in the SERVER's local time zone.
// Raw queries then returned Date objects where the code compares ISO strings ('2026-03-05' <= closed),
// so such comparisons were silently false (a closed accounting period was not enforced for raw reads).
// Dates are calendar days, not instants: keep them as 'YYYY-MM-DD' strings, exactly as TypeORM does
// for entity `date` columns.
import { types } from 'pg';

types.setTypeParser(1082, (value: string) => value);
