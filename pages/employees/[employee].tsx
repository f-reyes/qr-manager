import Layout from "../../components/Layout";
import styles from "../../styles/employess.module.scss";
import { useQuery } from "@tanstack/react-query";
import PrintButton from "../../components/PrintButton";
import { baseUrl } from "../../lib/constants";
import EmployeeTable from "../../components/EmployeeTable";

export default function Employee({ employeeID }) {
  const employeeQuery = useQuery({
    queryKey: ["employee", employeeID],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/employee?employeeID=${employeeID}`
      );
      if (!response.ok) {
        throw new Error("Something went wrong");
      } else {
        return await response.json();
      }
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["events", employeeID],
    queryFn: async () => {
      const response = await fetch(
        `${baseUrl}/api/event?employeeID=${employeeID}`
      );
      if (!response.ok) {
        throw new Error("Something went wrong");
      } else {
        return await response.json();
      }
    },
  });

  if (employeeQuery.isLoading || eventsQuery.isLoading) {
    return <>loading</>;
  }

  if (employeeQuery.isError || eventsQuery.isError) {
    return <>error</>;
  }

  const employee = employeeQuery.data[0];
  const events = eventsQuery.data;

  // / I do this because I want to modify one of the properties, but dont want to change the original
  // / object in case I may need it later

  events.forEach((event: event) => {
    event.print = <PrintButton employee_id={employee.id} event_id={event.id} />;
    event.has_printed_qr = event.has_printed_qr ? "Si" : "No";
  });

  return (
    <Layout>
      <section className={styles.container}>
        <h1>Empleado</h1>
        <div className={styles.info}>
          <ul>
            <li>
              <h2>Nombre: </h2>
              <span>{employee.name}</span>
            </li>
            <li>
              <h2>Email: </h2>
              <span>{employee.email}</span>
            </li>
            <li>
              <h2>Cedula: </h2>
              <span>{employee.cedula}</span>
            </li>
            <li>
              <h2>Compañia: </h2>
              <span>{employee.company}</span>
            </li>
            <li>
              <h2>Permisos: </h2>
              <span>{employee.permission}</span>
            </li>
          </ul>
        </div>
        <EmployeeTable
          events={events}
          employee={employee}
          viewEndpoint="/events/"
        />
      </section>
    </Layout>
  );
}

export async function getServerSideProps(context) {
  const employeeID = context.params.employee;
  return { props: { employeeID } };
}
