"use client";

import Link from "next/link";

export default function Login() {
    return (
        <div className="container">
            <div className="glass-card">
                
                {/* Section Gauche */}
                <div className="left-side"></div>

                {/* Section Droite */}
                <div className="right-side">
                    <div className="form-wrapper">
                        <img src="logo(3).JPG" className="logo" alt="Logo" />
                        
                        <h1>Welcome Back</h1>
                        <p className="subtitle">Enter your email and password to access your account</p>

                        <div className="form-container">
                            <label className="bold-label">Email</label>
                            <input type="email" name="email" placeholder="Enter email" className="input-field" />
                            
                            <label className="bold-label spacer">Password</label>
                            <input type="password" name="password" placeholder="Enter password" className="input-field" />

                            <div className="button-center">
                                <Link href="/dashboard" className="login-btn">
                                    <span>Se connecter</span>
                                </Link>
                            </div>

                            <div>
                                <p className="signup-text">
                                    Don't have an account? 
                                    <Link href="/register">
                                        <span className="signup-link">Sign up</span>
                                    </Link>
                                </p>
                            </div>

                            <div className="back-container">
                                <Link href="/" className="back-btn">Back</Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .container {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    width: 100%;
                    background-image: url('/background.jpg');
                    background-size: cover;
                    background-position: center;
                }

                .glass-card {
                    display: flex;
                    flex-direction: row;
                    justify-content: center;
                    align-items: center;
                    height: 95vh;
                    width: 60%;
                    background-color: rgba(255,255,255,0.1);
                    border-radius: 30px;
                    overflow: hidden;
                }

                .left-side {
                    width: 45%;
                    background-color: transparent;
                    height: 90vh;
                    margin-left: 10px;
                }

                .right-side {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    border-radius: 15px;
                    width: 55%;
                    background-color: #fff;
                }

                .form-wrapper {
                    width: 100%;
                    max-width: 400px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .logo {
                    width: 80px;
                    height: auto;
                    margin-bottom: 20px;
                    object-fit: contain;
                }

                h1 {
                    color: black;
                    font-size: 36px;
                    margin-bottom: 2px;
                    margin-top: 20px;
                }

                .subtitle {
                    color: black;
                    margin-bottom: 10px;
                    font-size: 14px;
                }

                .form-container {
                    background-color: white;
                    display: flex;
                    flex-direction: column;
                    padding: 20px;
                    color: black;
                    width: 400px;
                }

                .bold-label {
                    font-weight: bold;
                }

                .spacer {
                    margin-top: 10px;
                }

                .input-field {
                    border: 1px solid #ccc;
                    padding: 8px;
                    border-radius: 10px;
                    margin-bottom: 10px;
                }

                .button-center {
                    display: flex;
                    justify-content: center;
                }
                
                :global(.login-btn) {
                    background-color: green !important;
                    margin-top: 30px;
                    padding: 10px 20px;
                    border-radius: 10px;
                    cursor: pointer;
                    text-decoration: none !important;
                    display: inline-block;
                }

                :global(.login-btn span) {
                    color: white !important;
                    font-weight: bold;
                }

                .signup-text {
                    text-align: center;
                    margin-top: 100px;
                    color: black;
                }

                .signup-link {
                    color: black;
                    font-weight: bold;
                    font-size: 18px;
                    margin-left: 5px;
                    cursor: pointer;
                }

                .back-container {
                    display: flex;
                    justify-content: left;
                    margin-top: 70px;
                    width: 100%;
                }

                .back-btn {
                    color: black;
                    font-size: 20px;
                    font-weight: bold;
                    text-decoration: none;
                    cursor: pointer;
                }
            `}</style>
        </div>
    );
}