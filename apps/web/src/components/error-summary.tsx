import React from 'react';

export default function ErrorSummary({ errors }: { errors?: string[] }) {
    return (
        <div data-error-summary role="alert">
            <h2>There is a problem</h2>
            <ul>
                {errors?.map((error, index) => (
                    <li key={index}><a href={`#${error.split(' ').join('-')}`}>{error}</a></li>
                ))}
            </ul>
        </div>
    );
}