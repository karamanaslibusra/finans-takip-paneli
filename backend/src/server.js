  
   require('dotenv').config();
   const express = require('express');
   const cors = require('cors');
   const { PrismaClient } = require('@prisma/client');

   const app = express();
   const prisma = new PrismaClient();
   const PORT = process.env.PORT || 5000;

   
   app.use(cors());
   app.use(express.json());
    
   app.post('/api/transactions', async (req, res) => {
     try {
       const {
         amount,
         currency = 'TRY',
         date,
         description,
         type, 
         isRecurring = false,
         recurringRule,
         userId,
         categoryId,
       } = req.body;

       const tx = await prisma.transaction.create({
         data: {
           amount,
           currency,
           date: date ? new Date(date) : new Date(),
           description,
           type,
           isRecurring,
           recurringRule: recurringRule ? JSON.stringify(recurringRule) : null,
           user: { connect: { id: userId } },
           category: { connect: { id: categoryId } },
         },
       });
       res.status(201).json(tx);
     } catch (err) {
       console.error(err);
       res.status(500).json({ error: 'Failed to create transaction' });
     }
   });

   app.get('/api/transactions', async (req, res) => {
     try {
       const {
         start,
         end,
         type,
         categoryId,
         page = 1,
         limit = 20,
       } = req.query;

       const where = {};
       if (start) where.date = { ...where.date, gte: new Date(start) };
       if (end) where.date = { ...where.date, lte: new Date(end) };
       if (type) where.type = type;
       if (categoryId) where.categoryId = Number(categoryId);

       const skip = (Number(page) - 1) * Number(limit);
       const take = Number(limit);

       const [transactions, total] = await prisma.$transaction([
         prisma.transaction.findMany({
           where,
           include: { category: true },
           orderBy: { date: 'desc' },
           skip,
           take,
         }),
         prisma.transaction.count({ where }),
       ]);

       res.json({ data: transactions, total, page: Number(page), limit: Number(limit) });
     } catch (err) {
       console.error(err);
       res.status(500).json({ error: 'Failed to fetch transactions' });
     }
   });

   app.get('/api/analytics/summary', async (req, res) => {
     try {
       const { userId, month } = req.query; 
       const start = month ? new Date(`${month}-01`) : new Date(new Date().getFullYear(), new
 Date().getMonth(), 1);
       const end = month ? new Date(`${month}-31`) : new Date(); 

       const [incomeSum, expenseSum, categoryExpenses] = await prisma.$transaction([
         prisma.transaction.aggregate({
           where: { userId: Number(userId), type: 'INCOME', date: { gte: start, lte: end } },
           _sum: { amount: true },
         }),
         prisma.transaction.aggregate({
           where: { userId: Number(userId), type: 'EXPENSE', date: { gte: start, lte: end } },
           _sum: { amount: true },
         }),
         prisma.transaction.groupBy({
           by: ['categoryId'],
           where: {
             userId: Number(userId),
             type: 'EXPENSE',
             date: { gte: start, lte: end },
           },
           _sum: { amount: true },
           include: { category: true },
         }),
       ]);

       const income = incomeSum._sum.amount || 0;
       const expense = expenseSum._sum.amount || 0;
       const balance = income - expense;

       const categorySummary = categoryExpenses.map(g => ({
         categoryId: g.categoryId,
         categoryName: g.category ? g.category.name : 'Unknown',
         amount: g._sum.amount || 0,
       }));

       res.json({
         period: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
         income,
         expense,
         balance,
         byCategory: categorySummary,
       });
     } catch (err) {
       console.error(err);
       res.status(500).json({ error: 'Failed to compute analytics' });
     }
   });

   
   app.get('/health', (req, res) => res.send('OK'));

   app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
 