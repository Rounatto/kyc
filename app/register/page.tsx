import Link from "next/link";
export default function Register(){
    return(
        <>
            <h1>REGISTER PAGE</h1>
            <>
                <label>Name</label>
                <input type="text" name="name" placeholder="Enter name" />
                <label>Last Name</label>
                <input type="text" name="lastName" placeholder="Enter last name" />
                <label>Email</label>
                <input type="email" name="email" placeholder="Enter email" />
                <label>Password</label>
                <input type="password" name="password" placeholder="Enter password" />
                <label>Confirm Password</label>
                <input type="password" name="confirmPassword" placeholder="Confirm password" />
            </>
            <>
                <Link href = "/">Back</Link>
            </>
        </>
    )
}