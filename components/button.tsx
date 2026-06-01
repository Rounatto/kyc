export default function Button({children, className = "bg-blue-600 hover:bg-blue-700"}) {
    return (
        <button className={`px-4 py-2 text-white font-semibold rounded-lg shadow-md transition duration-200 ${className}`}>
            {children}
        </button>
    );
}