import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout.tsx'
import Home from './pages/Home.tsx'
import MovieListing from './pages/MovieListing.tsx'
import Scan from './pages/Scan.tsx'
import Purchase from './pages/Purchase.tsx'
import './App.css'

function App() {
    return (
        <>
        <Routes>
            <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="movies" element={<MovieListing />} />
                <Route path="scan" element={<Scan />} />
                <Route path="purchase" element={<Purchase />} />
            </Route>
        </Routes>
        </>
    )
}

export default App