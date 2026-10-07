import '../../components/App.css'

export default function Delete() {
    return(
        <div className="accountPage">
            <div>
                Are you sure you want to delete your account? This action cannot be undone.
            </div>
            <div>
                <form className="form">
                    <label>
                        Confirm Password: <input name="password" type="password"/>
                    </label>
                    <button>
                        Delete Account
                    </button>
                </form>
            </div>
        </div>
    )
}