import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function AdminPanel() {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedCredential, setSelectedCredential] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      router.push('/admin-login');
      return;
    }
    fetchCredentials();
  }, []);

  const fetchCredentials = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/credentials`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setCredentials(data.credentials);
      }
    } catch (error) {
      console.error('Error fetching credentials:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    router.push('/admin-login');
  };

  const filteredCredentials = credentials.filter(credential => {
    const matchesSearch = credential.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || credential.otpStatus === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'Extracted':
        return 'bg-green-100 text-green-800';
      case 'Failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const showCredentialDetails = (credential) => {
    setSelectedCredential(credential);
    setShowDetailModal(true);
  };

  const closeModal = () => {
    setShowDetailModal(false);
    setSelectedCredential(null);
  };

  const extractOTP = async (id) => {
    try {
      const token = localStorage.getItem('adminToken');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/extract-otp/${id}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.success) {
        fetchCredentials();
        alert('OTP extraction completed successfully!');
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (error) {
      alert(`Error: \${error.message}`);
    }
  };

  return (
    <>
      <Head>
        <title>CreatorHub Admin Panel</title>
        <meta name="description" content="Admin Panel for CreatorHub" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <header className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">CreatorHub Admin Panel</h1>
              <p className="text-gray-600">Manage Gmail Credentials and OTP Extraction</p>
            </div>
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-700 text-white font py-2 px-4 rounded"
            >
              Logout
            </button>
          </header>

          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
              <div className="mb-4 md:mb-0">
                <h2 className="text-xl font-semibold">Gmail Credentials</h2>
                <p className="text-gray-600">Total: {credentials.length} credentials</p>
              </div>
              <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4">
                <div>
                  <input
                    type="text"
                    placeholder="Search by email..."
                    className="px-3 py-2 border rounded-md w-full md:w-64"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div>
                  <select
                    className="px-3 py-2 border rounded-md w-full md:w-48"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                  >
                    <option value="all">All Status</option>
                    <option value="Pending">Pending</option>
                    <option value="Extracted">Extracted</option>
                    <option value="Failed">Failed</option>
                  </select>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <p>Loading credentials...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        OTP
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Added Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredCredentials.length > 0 ? (
                      filteredCredentials.map((credential) => (
                        <tr key={credential._id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {credential.email}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full \${getStatusColor(credential.otpStatus)}`}>
                              {credential.otpStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {credential.otp || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {new Date(credential.timestamp).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <button
                              onClick={() => showCredentialDetails(credential)}
                              className="text-indigo-600 hover:text-indigo-900 mr-3"
                            >
                              View
                            </button>
                            <button
                              onClick={() => extractOTP(credential._id)}
                              className="bg-blue-500 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs"
                              disabled={credential.otpStatus === 'Extracted'}
                            >
                              Extract OTP
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                          No credentials found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Detail Modal */}
        {showDetailModal && selectedCredential && (
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Credential Details</h3>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-500">Email</h4>
                  <p className