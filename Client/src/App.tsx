import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.tsx'
import AccountLayout from './components/accountLayout.tsx'
import Home from './pages/Home.tsx'
import MovieListing from './pages/MovieListing.tsx'
import Scan from './pages/Scan.tsx'
import Purchase from './pages/Purchase.tsx'
import Login from './pages/Login.tsx'
import CreateAccount from './pages/CreateAccount.tsx'
import Account from './pages/accountPages/Account.tsx'
import Change from './pages/accountPages/Change.tsx'
import Tickets from './pages/accountPages/Tickets.tsx'
import Logout from './pages/accountPages/Logout.tsx'
import Delete from './pages/accountPages/Delete.tsx'
import './components/App.css'

function App() {
    return (
        <>
        <Routes>
            <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="movies" element={<MovieListing />} />
                <Route path="scan" element={<Scan />} />
                <Route path="purchase" element={<Purchase />} />
                <Route path="login" element={<Login />} />
                <Route path="createAccount" element={<CreateAccount />} />
                <Route element={<AccountLayout />}>
                    <Route path="account" element={<Account />} />
                    <Route path="change" element={<Change />} />
                    <Route path="tickets" element={<Tickets />} />
                    <Route path="logout" element={<Logout />} />
                    <Route path="delete" element={<Delete />} />
                </Route>
            </Route>
        </Routes>
        </>
    )
}

export default App