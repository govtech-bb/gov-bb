import { render, screen } from "@testing-library/react";
import ApplicationClosed from "./application-closed";

describe("ApplicationClosed", () => {
  it("shows the service title, formatted deadline, and MDA contact", () => {
    render(
      <ApplicationClosed
        serviceTitle="National Science Camp 2026"
        closingDateTime="2026-07-09T23:59:00-04:00"
        contactDetails={{
          title: "Ministry of Education",
          email: "camp@example.gov.bb",
          telephoneNumber: "246-555-0100",
        }}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: /Applications for National Science Camp 2026 have closed/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Thursday, 9 July 2026 at 11:59pm"),
    ).toBeInTheDocument();
    expect(screen.getByText("camp@example.gov.bb")).toBeInTheDocument();
    expect(screen.getByText("246-555-0100")).toBeInTheDocument();
  });

  it("renders without a contact block when contactDetails is absent", () => {
    render(
      <ApplicationClosed
        serviceTitle="Some Service"
        closingDateTime="2026-07-09T23:59:00-04:00"
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: /Applications for Some Service have closed/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/contact:/i)).not.toBeInTheDocument();
  });
});
