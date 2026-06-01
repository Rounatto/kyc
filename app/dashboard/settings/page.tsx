import Link from "next/link";

export default function Settings(){
    return(
        <div>
            <div>
                <h1>Settings</h1>
            </div>
            <div>
                <Link href="/dashboard">Back to Dashboard</Link>
            </div>
        </div>
    )
}