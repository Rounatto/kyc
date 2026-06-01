import Link from 'next/link'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
        <div style={{backgroundColor:"grey", padding:"10px"}}>
            <Link href="/dashboard/home">Home</Link>
            <Link href="/dashboard/customers">Customers</Link>
            <Link href="/dashboard/settings">Settings</Link>
        </div>

        <div>
            {children}
        </div>

    </div>
  );
}
