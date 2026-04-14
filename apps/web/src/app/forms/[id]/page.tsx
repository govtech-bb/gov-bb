import designSystem from "apps/web/src/lib/design-system";

export default function Form({ params }: { params: { id: string } }) {
    return (
        <div className={designSystem.formRoot}>
            <h1>Form {params.id}</h1>
        </div>
    );
}