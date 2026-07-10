import { render, screen } from "@testing-library/react";
import ApplicationClosed from "./application-closed";

describe("ApplicationClosed", () => {
  it("shows the heading, subtext, formatted deadline, and MDA contact prose", () => {
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
      screen.getByText("The application window has closed."),
    ).toBeInTheDocument();
    expect(screen.getByText("Application closed")).toBeInTheDocument();
    expect(
      screen.getByText("Thursday, 9 July 2026 at 11:59pm"),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: "Have a question about this service?",
      }),
    ).toBeInTheDocument();
    // Contact rendered as prose: "contact the {MDA} at {email link} or call {number}".
    expect(
      screen.getByText(/contact the Ministry of Education/i),
    ).toBeInTheDocument();
    const emailLink = screen.getByRole("link", {
      name: "camp@example.gov.bb",
    });
    expect(emailLink).toHaveAttribute("href", "mailto:camp@example.gov.bb");
    expect(screen.getByText(/or call 246-555-0100/i)).toBeInTheDocument();
  });

  it("omits the contact section when contactDetails is absent", () => {
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
    expect(
      screen.queryByRole("heading", {
        name: "Have a question about this service?",
      }),
    ).not.toBeInTheDocument();
  });
});
