import React from "react";

export default function NotFound() {
  return (
    <div className="container py-8 lg:py-16">
      <div className="form-page form-page__message form-width">
        {/* Header */}
        <div>
          <h1 className="govbb-text-h1">We couldn&lsquo;t find that page</h1>
          <p>
            The page you’re looking for may have been moved, removed, or the
            address may have been typed incorrectly.
          </p>
        </div>

        {/* Suggestions */}
        <div>
          <h3 className="govbb-text-h3">Suggestions:</h3>
          <ul className="govbb-list govbb-list--bullet">
            <li>Check the web address for typos</li>
            <li>Return to the homepage</li>
          </ul>
        </div>

        {/* Quick Link Buttons */}
        <div>
          <a className="govbb-btn" href="/">
            Go to Homepage
          </a>
        </div>
      </div>
    </div>
  );
}
