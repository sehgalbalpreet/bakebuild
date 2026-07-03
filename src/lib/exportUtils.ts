
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Order, Bakery, ChocolateDetails, CakeDetails } from '../types';
import { formatCurrency } from './utils';

const getSafeDateString = (ts: any) => {
  if (!ts) return 'N/A';
  if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toLocaleString();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? 'N/A' : d.toLocaleString();
};

export const exportOrdersToExcel = (orders: Order[], bakeryName: string, dateLabel?: string) => {
  try {
    if (orders.length === 0) {
      alert("No orders found to export.");
      return;
    }

    const data = orders.map(d => {
      const isC = d.type === 'chocolate';
      const isDealerCake = d.type === 'dealer_cake';
      return {
        'Order ID': d.displayId || d.id,
        'Date': getSafeDateString(d.createdAt),
        'Customer': d.customerDetails?.name || 'N/A',
        'Phone': d.customerDetails?.phone || 'N/A',
        'Type': d.type,
        'Flavor': d.details.flavor || 'N/A',
        'Status': d.status,
        'Amount': isDealerCake ? 0 : d.totalAmount,
        'Advance': isDealerCake ? 0 : d.advanceReceived,
        'Due': isDealerCake ? 0 : (d.totalAmount || 0) - (d.advanceReceived || 0),
        'Dealer': d.dealerCompanyName || 'Direct',
        'Qty/Weight': isC ? (d.details as ChocolateDetails).quantity : (d.details as CakeDetails).weight,
        'Instruction': isC ? 'N/A' : (d.details as CakeDetails).instruction || 'N/A',
        'Cancellation Reason': d.cancelledReason || 'N/A',
        'Cancelled By': d.cancelledBy || 'N/A',
        'Ready By': d.readyBy || 'N/A',
        'Sent/Delivered By': d.sentBy || 'N/A',
        'Received By': d.receivedBy || 'N/A'
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const finalData = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
    
    const label = dateLabel || format(new Date(), 'yyyy-MM-dd');
    saveAs(finalData, `${bakeryName.replace(/\s+/g, '_')}_Orders_${label}.xlsx`);
  } catch (err: any) {
    console.error('EXPORT FAILED:', err);
    alert(`Export failed: ${err.message}`);
  }
};

export const generateOrderPDF = (order: Order, bakery: Bakery | null) => {
  try {
    const doc = new jsPDF();
    const isC = order.type === 'chocolate';
    const bakeryName = bakery?.name || 'BakeSync Bakery';
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(40);
    doc.text(bakeryName.toUpperCase(), 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('JOB SHEET / ORDER INVOICE', 105, 28, { align: 'center' });
    
    doc.setDrawColor(200);
    doc.line(20, 35, 190, 35);
    
    // Order Info
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.text(`Order ID: ${order.displayId || order.id.toUpperCase()}`, 20, 45);
    doc.text(`Status: ${order.status.toUpperCase()}`, 190, 45, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    const orderDate = getSafeDateString(order.createdAt);
    doc.text(`Placed On: ${orderDate}`, 20, 52);
    
    const delDate = order.deliveryDate ? format(new Date(order.deliveryDate), 'PPP') : 'N/A';
    doc.setFont('helvetica', 'bold');
    doc.text(`Delivery: ${delDate} @ ${order.deliveryTime || 'N/A'}`, 20, 59);
    
    // Customer Info
    const isDealerOrder = order.type === 'dealer_cake';
    doc.setDrawColor(240);
    doc.setFillColor(245, 247, 251);
    doc.rect(20, 65, 170, 25, 'F');
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(isDealerOrder ? 'DEALER / CUSTOMER' : 'CUSTOMER DETAILS', 25, 72);
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    
    let customerName = order.customerDetails?.name || 'Walk-in';
    // If it's a dealer order and the customer name is generic, use the dealer name as the primary contact
    if (isDealerOrder && (customerName === 'Walk-in' || customerName === 'Walk-in Customer') && order.dealerCompanyName) {
      customerName = order.dealerCompanyName;
    }
    
    doc.text(customerName, 25, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(order.customerDetails?.phone || '', 185, 80, { align: 'right' });
    
    // Product Table
    const tableData = [
      ['Product Type', order.type.replace('_', ' ').toUpperCase()],
      ['Flavor', order.details.flavor || 'N/A'],
      [isC ? 'Quantity' : 'Weight', isC ? (order.details as ChocolateDetails).quantity : `${(order.details as CakeDetails).weight} KG`],
      ['Source', order.dealerCompanyName || 'Direct Store Order']
    ];

    if (order.status === 'cancelled') {
      tableData.push(['Cancellation Reason', (order.cancelledReason || 'No reason specified').toUpperCase()]);
      tableData.push(['Cancelled By', (order.cancelledBy || 'N/A').toUpperCase()]);
    }
    if (order.sentBy) {
      tableData.push(['Delivered/Sent By', order.sentBy.toUpperCase()]);
    }
    if (order.readyBy) {
      tableData.push(['Marked Ready By', order.readyBy.toUpperCase()]);
    }
    if (order.inProgressBy) {
      tableData.push(['In Progress By', order.inProgressBy.toUpperCase()]);
    }
    if (order.receivedBy) {
      tableData.push(['Received By', order.receivedBy.toUpperCase()]);
    }
    
    autoTable(doc, {
      startY: 95,
      head: [['Field', 'Details']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] },
      margin: { left: 20, right: 20 }
    });
    
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    // Instructions
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('SPECIAL INSTRUCTIONS:', 20, finalY);
    doc.setFontSize(11);
    doc.setTextColor(40);
    doc.setFont('helvetica', 'italic');
    const instruction = isC ? 'N/A' : (order.details as CakeDetails).instruction || 'Standard product, no special instructions.';
    const splitInstruction = doc.splitTextToSize(instruction, 170);
    doc.text(splitInstruction, 20, finalY + 7);
    
    // Payment Info
    if (order.type !== 'dealer_cake') {
      const paymentY = finalY + (splitInstruction.length * 7) + 15;
      doc.setDrawColor(200);
      doc.line(20, paymentY, 190, paymentY);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.setFont('helvetica', 'normal');
      doc.text('Payment Summary', 20, paymentY + 10);
      
      // Helper for PDF currency to avoid broken symbols
      const pdfFormat = (amt: number) => `Rs. ${amt.toLocaleString('en-IN')}`;

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.text(`Total: ${pdfFormat(order.totalAmount)}`, 190, paymentY + 10, { align: 'right' });
      
      doc.setFontSize(10);
      doc.setTextColor(34, 197, 94);
      doc.text(`Advance Shared: ${pdfFormat(order.advanceReceived || 0)}`, 190, paymentY + 20, { align: 'right' });
      
      const due = (order.totalAmount || 0) - (order.advanceReceived || 0);
      if (due > 0) {
        doc.setTextColor(239, 68, 68);
        doc.text(`Balance Due: ${pdfFormat(due)}`, 190, paymentY + 30, { align: 'right' });
      } else {
        doc.setTextColor(34, 197, 94);
        doc.text('FULL PAYMENT RECEIVED', 190, paymentY + 30, { align: 'right' });
      }
    }
    
    // Add Footer
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.setFont('helvetica', 'normal');
    doc.text('This is a computer generated document powered by BakeSync.', 105, 285, { align: 'center' });
    
    // Add Image if exists
    const photoUrl = 'photoUrl' in order.details ? order.details.photoUrl : undefined;
    const slipUrl = 'slipUrl' in order.details ? order.details.slipUrl : undefined;
    const finalImageUrl = photoUrl || slipUrl;

    if (finalImageUrl && finalImageUrl.startsWith('data:image')) {
      try {
        doc.addPage();
        doc.setFontSize(14);
        doc.setTextColor(63, 81, 181);
        doc.setFont('helvetica', 'bold');
        doc.text(slipUrl ? 'ORDER SLIP REFERENCE' : 'CAKE DESIGN REFERENCE', 105, 20, { align: 'center' });
        
        // Add a nice border
        doc.setDrawColor(230);
        doc.rect(15, 25, 180, 250);
        
        // Detect format
        const formatMatching = finalImageUrl.match(/data:image\/(png|jpeg|jpg);base64/);
        const imgFormat = formatMatching ? formatMatching[1].toUpperCase() : 'JPEG';
        
        doc.addImage(finalImageUrl, imgFormat as any, 20, 30, 170, 0);
      } catch (e) {
        console.warn('PDF Image render failed:', e);
      }
    }

    doc.save(`${order.displayId || order.id}_Details.pdf`);
  } catch (err: any) {
    console.error('PDF GENERATION FAILED:', err);
    alert(`PDF generation failed: ${err.message}`);
  }
};
