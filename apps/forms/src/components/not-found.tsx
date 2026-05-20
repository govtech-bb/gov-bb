import React from "react";

export default function NotFound() {
  return (
    <div>
      <div>
        {/* Header */}
        <div>
          <h1>We couldn&lsquo;t find that page</h1>
          <p>
            The page you’re looking for may have been moved, removed, or the
            address may have been typed incorrectly.
          </p>
        </div>

        {/* Suggestions */}
        <div>
          <h3>Suggestions:</h3>
          <ul>
            <li>Check the web address for typos</li>
            <li>Return to the homepage</li>
          </ul>
        </div>

        {/* Quick Link Buttons */}
        <div>
          <a href="/">Go to Homepage</a>
        </div>
      </div>
    </div>
  );
}
