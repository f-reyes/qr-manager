import { NextApiRequest, NextApiResponse } from "next";
import db from "../../lib/db";
import format from "pg-format";

import { from as copyFrom } from "pg-copy-streams";
import { pipeline } from "node:stream/promises";
import path from "path";
import fs from "fs";
import fsAsync from "fs/promises";

export async function getEmployee(eventID?: string, employeeID?: string) {
  let query = "";
  if (employeeID) {
    /// send especific employee
    query = format("SELECT * FROM employees WHERE id = '%s'", employeeID);
  } else if (eventID) {
    /// send employees from events
    query = format(
      "SELECT employees.id, employees.name, employees.cedula, events_employees.has_printed_qr, events_employees.permission FROM employees, events_employees WHERE events_employees.event_id = '%s' AND events_employees.employee_id = employees.id ORDER BY name DESC",
      eventID
    );
  } else {
    ///send all employees
    query = "SELECT * FROM employees";
  }
  const client = await db.connect();
  const results = await client.query(query);
  client.release();

  return results.rows;
}

export async function postEmployee(text: string, eventID?: string) {
  try {
    await fsAsync.writeFile(
      path.resolve(path.join(process.cwd(), "/tmp", "empleados.csv")),
      text
    );
  } catch (err) {
    throw err;
  }

  const client = await db.connect();
  await client.query("BEGIN;");
  await client.query(
    "CREATE TEMP TABLE tmp_table (LIKE employees INCLUDING DEFAULTS, permission text) ON COMMIT DROP;"
  );

  const ingestStream = client.query(
    copyFrom(
      "COPY tmp_table(name, email, company, permission, cedula) FROM STDIN DELIMITER ',' CSV HEADER;"
    )
  );

  const sourceStream = fs.createReadStream(
    path.resolve(path.join(process.cwd(), "/tmp", "empleados.csv"))
  );

  await pipeline(sourceStream, ingestStream);

  const idsResults = await client.query(
    "INSERT INTO employees(id, name, email, cedula, company) SELECT id, name, email, cedula, company FROM tmp_table ON CONFLICT (cedula) DO UPDATE SET cedula = excluded.cedula RETURNING id, (SELECT permission FROM tmp_table where tmp_table.name = employees.name)"
  );

  const mappedEventsEmployeesValues = idsResults.rows.map((v) => [
    eventID,
    v.id,
    v.permission,
  ]);
  /// maybe move this to another function

  const results = await client.query(
    format(
      "INSERT INTO events_employees (event_id, employee_id, permission) VALUES %L ON CONFLICT DO NOTHING",
      mappedEventsEmployeesValues
    )
  );
  console.log(results);
  await client.query("COMMIT;");
  client.release();
}

// ON CONFLICT (event_id, employee_id) DO UPDATE SET event_id = excluded.event_id, employee_id = excluded.employee_id RETURNING (event_id, employee_id)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    const { eventID, employeeID } = req.query;
    if (!Array.isArray(eventID) && !Array.isArray(employeeID)) {
      if (eventID && employeeID) {
        res.status(400).send("API route only works with one ID at a time");
      }
      try {
        const result = await getEmployee(eventID, employeeID);
        res.send(result);
      } catch (err) {
        console.log(err);
        res.status(500).send("something went wrong");
      }
    } else {
      res
        .status(400)
        .send("Did not expect array of strings as value for one of the IDs");
    }
  }
  if (req.method === "POST") {
    /// TODO: fix this part here
    try {
      const { CSVtext, eventID } = JSON.parse(req.body);
      postEmployee(CSVtext, eventID);
      res.send("Database updated");
    } catch (err) {
      console.log(err);
      res.status(500).send("Something went wrong");
    }
  }
}
