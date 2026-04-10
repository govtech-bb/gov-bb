export default function Form({ params }: { params: { id: string } }) {
    return (
        <div>
            <h1>Form {params.id}</h1>
        </div>
    );
}