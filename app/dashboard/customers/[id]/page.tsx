"use client"
import { useState } from "react";

export default function SingleCustomerPage() {
    const [idInput, setIdInput] = useState("");
    const [customerId, setCustomerId] = useState("Aucun");
	return (
        <div>
            <h1></h1>
            <div>
                <label>Ecris l'id du client :</label>
                <div>
                    <input type="text" placeholder="EX: 45, 99,..." value={idInput} onChange = {(e) => setIdInput(e.target.value)}/>
                    <button onClick = {() => setCustomerId(idInput)}>Valider</button>
                </div>
            </div>
            <div>
                <p>Id affiché actuellement: <span>{customerId}</span></p>
            </div>
        </div>
		
	);
}
